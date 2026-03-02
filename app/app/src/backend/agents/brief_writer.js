const { saveBrief } = require('../brief/store');

const BriefWriterAgent = {
  key: 'brief_writer',
  name: 'Brief Writer',
  canHandle(evt) {
    return evt.type === 'brief.ready';
  },
  async onEvent(evt, registry) {
    const brief = evt.payload;
    const saved = saveBrief(registry.db, { ...brief, correlation_id: evt.correlation_id || evt.id });
    registry.audit('brief.saved', { briefId: saved.id, title: saved.title }, this.key);
  },
};

module.exports = { BriefWriterAgent };
