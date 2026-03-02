const { emitEvent } = require('../eventBus/bus');

const CortexAgent = {
  key: 'cortex',
  name: 'Cortex (Context + Orchestration)',
  canHandle(evt) {
    return evt.type === 'brief.requested';
  },
  async onEvent(evt, registry) {
    registry.audit('cortex.brief.start', { correlation_id: evt.correlation_id || evt.id }, this.key);

    const correlationId = evt.correlation_id || evt.id;

    // Fan-out (stubs for now)
    emitEvent(registry.db, {
      type: 'weather.requested',
      source_agent_key: this.key,
      target_agent_key: 'weather',
      correlation_id: correlationId,
      payload: { location: 'New Lenox, IL 60451' },
    });

    emitEvent(registry.db, {
      type: 'news.requested',
      source_agent_key: this.key,
      target_agent_key: 'web_summary',
      correlation_id: correlationId,
      payload: { sources: ['us_news', 'thehackernews'] },
    });

    emitEvent(registry.db, {
      type: 'calendar.scan_requested',
      source_agent_key: this.key,
      target_agent_key: 'calendar',
      correlation_id: correlationId,
      payload: {},
    });

    emitEvent(registry.db, {
      type: 'email.scan_requested',
      source_agent_key: this.key,
      target_agent_key: 'email_scan',
      correlation_id: correlationId,
      payload: {},
    });

    // In v1 we just emit a placeholder brief immediately.
    emitEvent(registry.db, {
      type: 'brief.ready',
      source_agent_key: this.key,
      correlation_id: correlationId,
      payload: {
        title: 'Morning Brief',
        blocks: [
          { kind: 'weather', text: 'Weather: (stub) — will connect to real provider next.' },
          { kind: 'calendar', text: 'Calendar: (stub) — Google Calendar not connected.' },
          { kind: 'email', text: 'Email: (stub) — Gmail not connected.' },
          { kind: 'news', text: 'News: (stub) — web summarizer not connected.' },
        ],
      },
    });

    registry.audit('cortex.brief.queued', { correlation_id: correlationId }, this.key);
  },
};

module.exports = { CortexAgent };
