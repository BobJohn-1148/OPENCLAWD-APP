const { emitEvent } = require('../eventBus/bus');

function mkStubAgent(key, name, handlers) {
  return {
    key,
    name,
    canHandle(evt) {
      return Boolean(handlers[evt.type]);
    },
    async onEvent(evt, registry) {
      registry.audit(`${key}.received`, { type: evt.type }, key);
      const out = await handlers[evt.type](evt, registry);
      if (out) emitEvent(registry.db, { ...out, source_agent_key: key, correlation_id: evt.correlation_id || evt.id });
    },
  };
}

const WeatherAgent = mkStubAgent('weather', 'Weather/Reminders', {
  'weather.requested': async () => ({
    type: 'weather.ready',
    payload: { text: '28°F now (stub). High 36° / Low 22°.' },
  }),
});

const WebSummaryAgent = mkStubAgent('web_summary', 'Web Summary', {
  'news.requested': async () => ({
    type: 'news.ready',
    payload: { bullets: ['US: (stub) headline 1', 'The Hacker News: (stub) headline A'] },
  }),
});

const CalendarAgent = mkStubAgent('calendar', 'Calendar + Family Messaging', {
  'calendar.scan_requested': async () => ({
    type: 'calendar.summary_ready',
    payload: { text: 'No events (stub).' },
  }),
});

const EmailScanAgent = mkStubAgent('email_scan', 'Email Scan + Notifications', {
  'email.scan_requested': async () => ({
    type: 'email.summary_ready',
    payload: { text: '0 important emails (stub).' },
  }),
});

module.exports = { WeatherAgent, WebSummaryAgent, CalendarAgent, EmailScanAgent };
