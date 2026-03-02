const { takeNextEvent, completeEvent } = require('./bus');

class Dispatcher {
  constructor({ db, registry, intervalMs = 500 }) {
    this.db = db;
    this.registry = registry;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.running = false;
  }

  start() {
    if (this.timer) return;
    this.running = true;
    this.timer = setInterval(() => this.tick().catch(() => {}), this.intervalMs);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (!this.running) return;

    // global (broadcast) events: pull once per tick
    const evt = takeNextEvent(this.db);
    if (!evt) return;

    try {
      await this.registry.handleEvent(evt);
      completeEvent(this.db, evt.id, 'done');
    } catch (err) {
      completeEvent(this.db, evt.id, 'deadletter');
      this.registry.audit('dispatcher.error', {
        eventId: evt.id,
        type: evt.type,
        message: String(err?.message || err),
      });
    }
  }
}

module.exports = { Dispatcher };
