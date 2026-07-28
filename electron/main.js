// Electron main process for the pharma scale station.
//
// Modes:
//   --validate  : open a throwaway SQLite DB, apply the schema, print the
//                 table list, then quit. Proves better-sqlite3 works under
//                 the pinned Electron ABI (CI-friendly). No window.
//   (default)   : open the per-station DB, register IPC, create the window.
//
// Web Serial note: Electron has NO built-in port picker — without the
// select-serial-port handler below, navigator.serial.requestPort() rejects.
// The handler auto-grants the pinned scale (station-config) or, failing that,
// the only/first listed port, so the shop floor never sees a chooser.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');
const { openDatabase, listTables } = require('./db/connection');
const { openDataStore } = require('./db/datastore');
const { registerDbIpc } = require('./ipc');
const { KNOWN_SCALE_DEVICE } = require('./station-config');

const isValidateMode = process.argv.includes('--validate');
const devUrl = process.env.SCALE_DEV_SERVER_URL;

function runValidation() {
  const dbPath = path.join(os.tmpdir(), `scale-validate-${process.pid}.db`);
  try {
    const db = openDatabase(dbPath);
    const tables = listTables(db);
    console.log('[scale:validate] better-sqlite3 OK under Electron', process.versions.electron);
    console.log('[scale:validate] node-abi', process.versions.modules);
    console.log(`[scale:validate] schema applied — ${tables.length} tables:`);
    console.log(tables.join(', '));
    db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
    app.exit(0);
  } catch (err) {
    console.error('[scale:validate] VALIDATION FAILED:', err);
    app.exit(1);
  }
}

function matchesKnownScale(port) {
  if (!KNOWN_SCALE_DEVICE) return false;
  const { usbVendorId, usbProductId } = KNOWN_SCALE_DEVICE;
  return (
    (usbVendorId === undefined || port.vendorId === String(usbVendorId)) &&
    (usbProductId === undefined || port.productId === String(usbProductId))
  );
}

function grantSerialAccess(session) {
  session.on('select-serial-port', (event, portList, _webContents, callback) => {
    event.preventDefault();
    const pinned = portList.find(matchesKnownScale);
    const chosen = pinned ?? portList[0];
    callback(chosen ? chosen.portId : '');
  });
  session.setPermissionCheckHandler((_wc, permission) => permission === 'serial');
  session.setDevicePermissionHandler((details) => details.deviceType === 'serial');
}

function createWindow() {
  const win = new BrowserWindow({
    // Production runs fullscreen (station app, no chrome). Dev stays a normal
    // resizable window so DevTools is usable. Kiosk lock-down is Phase 8.
    fullscreen: !devUrl,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  grantSerialAccess(win.webContents.session);

  if (devUrl) {
    // The Angular dev server may still be compiling (or not started yet) —
    // retry until it answers instead of sitting on a blank window.
    win.webContents.on('did-fail-load', (_evt, code, desc) => {
      console.log(`[scale:dev] ${devUrl} not ready (${code} ${desc}) — retrying in 1.5s`);
      setTimeout(() => win.loadURL(devUrl), 1500);
    });
    win.loadURL(devUrl);
    win.webContents.openDevTools();
  } else {
    // Built renderer output (ng build --base-href ./ → dist/zoulte-scale/browser).
    win.loadFile(path.join(__dirname, '..', 'dist', 'zoulte-scale', 'browser', 'index.html'));
  }
}

app.whenReady().then(() => {
  if (isValidateMode) {
    runValidation();
    return;
  }
  const store = openDataStore(path.join(app.getPath('userData'), 'scale-station.db'));
  registerDbIpc(store);
  app.on('before-quit', () => store.close());

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
