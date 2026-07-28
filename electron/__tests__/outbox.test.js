// Schema-semantics integration test for the offline capture pipeline:
// capture transaction atomicity, outbox UPSERT coalescing, crash recovery,
// and the synced mirror — against real better-sqlite3 under Electron.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const assert = require('node:assert');
const { openDataStore } = require('../db/datastore');

const OUTBOX_UPSERT = `INSERT INTO ws_sync_outbox (entity_type, entity_uuid, operation, payload, sync_status, created_at)
  VALUES (?, ?, ?, ?, 'QUEUED', ?)
  ON CONFLICT (entity_type, entity_uuid, operation) DO UPDATE SET
    payload = excluded.payload, sync_status = 'QUEUED', created_at = excluded.created_at,
    attempt_count = 0, last_error = NULL, next_attempt_at = NULL, sent_at = NULL, acked_at = NULL`;

function captureOps(uuid, weight, at) {
  return [
    {
      sql: `INSERT INTO ws_reading (reading_uuid, product_name, manufacturer_name, batch_no,
              manufacturing_date, expiry_date, net_weight, unit, operator, captured_at_client)
            VALUES (?, 'Paracetamol 500', 'Acme Pharma', 'B-2041', '2026-01-01', '2027-01-01', ?, 'GRAM', 'op1', ?)`,
      params: [uuid, weight, at],
    },
    {
      sql: `INSERT INTO ws_audit (audit_uuid, entity_type, entity_uuid, event, actor, at_client)
            VALUES (?, 'READING', ?, 'READING_CAPTURED', 'op1', ?)`,
      params: [`audit-${uuid}`, uuid, at],
    },
    { sql: OUTBOX_UPSERT, params: ['READING', uuid, 'CREATE', JSON.stringify({ weight }), at] },
  ];
}

module.exports = async function run() {
  const dbPath = path.join(os.tmpdir(), `scale-test-${process.pid}.db`);
  const store = openDataStore(dbPath);
  const t0 = '2026-07-27T10:00:00.000Z';

  try {
    // 1. Capture transaction is atomic: reading + audit + outbox land together.
    store.transaction(captureOps('r-1', 56.6, t0));
    assert.equal(store.get('SELECT count(*) AS n FROM ws_reading').n, 1);
    assert.equal(store.get('SELECT count(*) AS n FROM ws_audit').n, 1);
    assert.equal(store.get("SELECT sync_status FROM ws_sync_outbox WHERE entity_uuid = 'r-1'").sync_status, 'QUEUED');

    // ...and a failing op rolls back the whole capture.
    assert.throws(() =>
      store.transaction([
        ...captureOps('r-2', 10, t0).slice(0, 2),
        { sql: 'INSERT INTO no_such_table VALUES (1)', params: [] },
      ]),
    );
    assert.equal(store.get("SELECT count(*) AS n FROM ws_reading WHERE reading_uuid = 'r-2'").n, 0);

    // 2. Outbox UPSERT coalesces a repeat pending event: one row, latest payload,
    //    attempts reset — even after a retry cycle bumped the counters.
    store.run("UPDATE ws_sync_outbox SET sync_status = 'RETRYING', attempt_count = 4 WHERE entity_uuid = 'r-1'");
    store.run(OUTBOX_UPSERT, ['READING', 'r-1', 'CREATE', JSON.stringify({ weight: 57.0 }), t0]);
    const coalesced = store.get("SELECT * FROM ws_sync_outbox WHERE entity_uuid = 'r-1'");
    assert.equal(store.get('SELECT count(*) AS n FROM ws_sync_outbox').n, 1);
    assert.equal(coalesced.sync_status, 'QUEUED');
    assert.equal(coalesced.attempt_count, 0);
    assert.equal(JSON.parse(coalesced.payload).weight, 57.0);

    // 3. Crash recovery: SENDING rows requeue on boot.
    store.run("UPDATE ws_sync_outbox SET sync_status = 'SENDING' WHERE entity_uuid = 'r-1'");
    store.run("UPDATE ws_sync_outbox SET sync_status = 'QUEUED' WHERE sync_status = 'SENDING'");
    assert.equal(store.get("SELECT sync_status FROM ws_sync_outbox WHERE entity_uuid = 'r-1'").sync_status, 'QUEUED');

    // 4. Synced mirror: outbox ack + entity sync_status move together.
    store.transaction([
      { sql: "UPDATE ws_sync_outbox SET sync_status = 'SYNCED', acked_at = ? WHERE entity_uuid = 'r-1'", params: [t0] },
      { sql: "UPDATE ws_reading SET sync_status = 'SYNCED', synced_at = ? WHERE reading_uuid = 'r-1'", params: [t0] },
    ]);
    assert.equal(store.get("SELECT sync_status FROM ws_reading WHERE reading_uuid = 'r-1'").sync_status, 'SYNCED');
  } finally {
    store.close();
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
  }
};
