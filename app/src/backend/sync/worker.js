const { syncOutboxOnce, getAppSetting } = require('./outbox');

class OutboxSyncWorker {
  constructor({ db, registry, intervalMs = 30_000 }) {
    this.db = db;
    this.registry = registry;
    this.intervalMs = intervalMs;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.timer.unref?.();
    // initial
    this.tick();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    try {
      const cfg = getAppSetting(this.db, 'vps_sync') || { enabled: false, baseUrl: '' };
      if (!cfg.enabled || !cfg.baseUrl) return;
      const res = await syncOutboxOnce({ db: this.db, baseUrl: cfg.baseUrl });
      if (res.ok && res.added) {
        this.registry?.audit?.('sync.outbox.added', { added: res.added }, 'sync');
      }
    } catch (e) {
      this.registry?.audit?.('sync.outbox.error', { error: String(e?.message || e) }, 'sync');
    }
  }
}

module.exports = { OutboxSyncWorker };
