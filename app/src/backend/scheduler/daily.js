const { emitEvent } = require('../eventBus/bus');
const { shouldTriggerDaily } = require('../util/time');
const { getMeta } = require('../util/kv');

class DailyScheduler {
  constructor({ db, registry, timeZone = 'America/Chicago', hour = 7, minute = 30, intervalMs = 20_000 }) {
    this.db = db;
    this.registry = registry;
    this.timeZone = timeZone;
    this.hour = hour;
    this.minute = minute;
    this.intervalMs = intervalMs;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch(() => {}), this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    const last = getMeta(this.db, 'telegram.lastBriefSentAtMs');
    const lastSentAtMs = last ? Number(last) : null;

    if (
      shouldTriggerDaily({
        now: new Date(),
        timeZone: this.timeZone,
        hour: this.hour,
        minute: this.minute,
        lastSentAtMs,
      })
    ) {
      const evt = emitEvent(this.db, { type: 'brief.requested', source_agent_key: 'scheduler', payload: {} });
      this.registry.audit('scheduler.brief.requested', { eventId: evt.id, at: Date.now() }, 'scheduler');
    }
  }
}

module.exports = { DailyScheduler };
