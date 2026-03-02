const { id } = require('../util/ids');

function ensureBriefTable(db) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS briefs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_briefs_created ON briefs(created_at);
    `
  );
}

function saveBrief(db, brief) {
  ensureBriefTable(db);
  const row = {
    id: brief.id || id('brief'),
    title: brief.title || 'Brief',
    content_json: JSON.stringify(brief),
    created_at: Date.now(),
  };
  db.prepare('INSERT INTO briefs(id, title, content_json, created_at) VALUES(@id,@title,@content_json,@created_at)').run(row);
  return row;
}

function getLatestBrief(db) {
  ensureBriefTable(db);
  const row = db.prepare('SELECT * FROM briefs ORDER BY created_at DESC LIMIT 1').get();
  if (!row) return null;
  try {
    return { ...row, brief: JSON.parse(row.content_json) };
  } catch {
    return { ...row, brief: null };
  }
}

module.exports = { saveBrief, getLatestBrief, ensureBriefTable };
