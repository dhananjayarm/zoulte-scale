// Node-side DataStore over better-sqlite3 — the main-process half of the
// renderer's DataStore interface (query/get/run/transaction). Mirrors
// zoulte-pos-ui's datastore so borrowed sync/auth code runs unchanged.
const { openDatabase } = require('./connection');

function openDataStore(dbPath) {
  const db = openDatabase(dbPath);

  return {
    query(sql, params = []) {
      return db.prepare(sql).all(...normalise(params));
    },
    get(sql, params = []) {
      return db.prepare(sql).get(...normalise(params)) ?? null;
    },
    run(sql, params = []) {
      const info = db.prepare(sql).run(...normalise(params));
      return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
    },
    // ops: [{ sql, params }] — all-or-nothing, used by the transactional outbox.
    transaction(ops) {
      const applyAll = db.transaction((batch) => {
        for (const op of batch) {
          db.prepare(op.sql).run(...normalise(op.params ?? []));
        }
      });
      applyAll(ops);
      return { applied: ops.length };
    },
    close() {
      db.close();
    },
    raw: db,
  };
}

// better-sqlite3 accepts positional args spread or a single named-params
// object; wrap arrays so both call styles work through one code path.
function normalise(params) {
  return Array.isArray(params) ? params : [params];
}

module.exports = { openDataStore };
