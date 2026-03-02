const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function telegramSendMessage({ token, chatId, text }) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`Telegram sendMessage failed: ${json.description || 'unknown error'}`);
  }
  return json.result;
}

module.exports = { telegramSendMessage };
