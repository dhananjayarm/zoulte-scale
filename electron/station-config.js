// Per-station Electron-side configuration. The renderer keeps its own copy of
// the pinned scale in src/app/services/scale-device.config.ts (Web Serial
// filter); this one drives the main-process auto-grant so no picker ever
// appears on the shop floor. Both move into the settings DB in Phase 8.
//
// Leave KNOWN_SCALE_DEVICE null until the scale has been paired once — the
// Connection card shows the vendor/product IDs after the first connect.
module.exports = {
  KNOWN_SCALE_DEVICE: null, // e.g. { usbVendorId: 0x067b, usbProductId: 0x2303 }
};
