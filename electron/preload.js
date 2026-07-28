// Preload bridge — exposes a promise-based DB API and environment info to the
// Angular renderer over contextBridge. contextIsolation stays on; the renderer
// detects Electron by checking for window.scaleBridge.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scaleBridge', {
  db: {
    query: (sql, params) => ipcRenderer.invoke('db:query', { sql, params }),
    get: (sql, params) => ipcRenderer.invoke('db:get', { sql, params }),
    run: (sql, params) => ipcRenderer.invoke('db:run', { sql, params }),
    transaction: (ops) => ipcRenderer.invoke('db:transaction', ops),
  },
  platform: process.platform,
  versions: {
    app: process.env.npm_package_version ?? '',
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    sqliteAbi: process.versions.modules,
  },
});
