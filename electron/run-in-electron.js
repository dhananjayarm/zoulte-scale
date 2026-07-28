// Minimal in-Electron test harness (POS pattern): runs every __tests__/*.test.js
// under the real Electron ABI against a throwaway SQLite DB, so schema + SQL
// semantics are proven where they actually execute. Usage: npm run test:db
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

const TESTS_DIR = path.join(__dirname, '__tests__');

app.whenReady().then(async () => {
  const files = fs.readdirSync(TESTS_DIR).filter((f) => f.endsWith('.test.js'));
  let failed = 0;
  for (const file of files) {
    const run = require(path.join(TESTS_DIR, file));
    try {
      await run();
      console.log(`[test:db] PASS ${file}`);
    } catch (err) {
      failed++;
      console.error(`[test:db] FAIL ${file}:`, err);
    }
  }
  app.exit(failed === 0 ? 0 : 1);
});
