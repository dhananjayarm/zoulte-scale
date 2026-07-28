// IPC surface between the Angular renderer and the main process. The renderer
// only ever sees promise-based db:* channels via the preload bridge — it never
// touches better-sqlite3 or Node directly.
const { ipcMain } = require('electron');

function registerDbIpc(store) {
  ipcMain.handle('db:query', (_evt, { sql, params }) => store.query(sql, params));
  ipcMain.handle('db:get', (_evt, { sql, params }) => store.get(sql, params));
  ipcMain.handle('db:run', (_evt, { sql, params }) => store.run(sql, params));
  ipcMain.handle('db:transaction', (_evt, ops) => store.transaction(ops));
}

module.exports = { registerDbIpc };
