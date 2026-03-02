const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

function defaultDbPath() {
  // Windows: %APPDATA%\BobAssistant\bob.db
  // Fallback: Electron userData from main process should pass an explicit path.
  const appData = process.env.APPDATA || process.env.HOME || process.cwd();
  return path.join(appData, 'BobAssistant', 'bob.db');
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function openDb(dbPath = defaultDbPath()) {
  ensureDir(dbPath);
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);

  // schema version
  const getVer = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
  if (!getVer) {
    db.prepare('INSERT INTO meta(key, value) VALUES(?, ?)').run('schema_version', '1');
  }

  return db;
}

module.exports = { openDb, defaultDbPath };
