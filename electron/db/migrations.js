// Forward-only schema migrations keyed on SQLite PRAGMA user_version (same
// pattern as zoulte-pos-ui). Migration 1 is the baseline schema.sql. Append
// new { version, label, apply } steps below; never edit a shipped one.
const path = require('node:path');
const fs = require('node:fs');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/** @type {{version:number,label:string,apply:(db:any)=>void}[]} */
const MIGRATIONS = [
  {
    version: 1,
    label: 'baseline per-station schema',
    apply: (db) => {
      db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    },
  },
];

/** Apply all pending migrations atomically; returns the resulting version. */
function runMigrations(db) {
  let current = db.pragma('user_version', { simple: true });
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    const step = db.transaction(() => {
      m.apply(db);
      db.pragma(`user_version = ${m.version}`);
    });
    step();
    current = m.version;
  }
  return current;
}

module.exports = { runMigrations, MIGRATIONS };
