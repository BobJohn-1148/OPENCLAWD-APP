const { telegramSendMessage } = require('../integrations/telegram');
const { getMeta, setMeta } = require('../util/kv');

const TELEGRAM_CHAT_ID = '1441348235';

function formatBrief(brief) {
  const title = brief?.title || 'Morning Brief';
  const blocks = brief?.blocks || [];
  const lines = [`${title}`];
  for (const b of blocks) {
    if (b?.text) lines.push(`• ${b.text}`);
  }
  return lines.join('\n');
}

const TelegramSenderAgent = {
  key: 'telegram_sender',
  name: 'Telegram Sender',
  canHandle(evt) {
    return evt.type === 'brief.ready' || evt.type === 'telegram.test_send';
  },
  async onEvent(evt, registry) {
    const cfg = registry.db
      .prepare(
        `SELECT ac.config_json AS config_json
         FROM agent_configs ac
         JOIN agents a ON a.id = ac.agent_id
         WHERE a.key = ?
         LIMIT 1`
      )
      .get('telegram_sender');

    const config = safeJson(cfg?.config_json) || {};
    const token = config.token;
    if (!token) {
      registry.audit('telegram_sender.missing_token', {}, this.key);
      return;
    }

    const text = evt.type === 'telegram.test_send'
      ? `Telegram test OK.\n\n${formatBrief(evt.payload?.brief)}`
      : formatBrief(evt.payload);

    await telegramSendMessage({ token, chatId: TELEGRAM_CHAT_ID, text });

    if (evt.type === 'brief.ready') {
      setMeta(registry.db, 'telegram.lastBriefSentAtMs', String(Date.now()));
    }

    registry.audit('telegram_sender.sent', { chatId: TELEGRAM_CHAT_ID, kind: evt.type }, this.key);
  },
};

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

module.exports = { TelegramSenderAgent, TELEGRAM_CHAT_ID };
