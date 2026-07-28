// Opens the per-station SQLite DB with the pragmas the offline design relies
// on (WAL for crash-safety under kiosk power loss, FK enforcement) and brings
// the schema up to date via the migration runner.
const Database = require('better-sqlite3');
const { runMigrations } = require('./migrations');

function openDatabase(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function listTables(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);
}

module.exports = { openDatabase, listTables };
