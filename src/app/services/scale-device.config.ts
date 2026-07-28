export interface KnownScaleDevice {
  usbVendorId?: number;
  usbProductId?: number;
}

// Identifies the scale so Connect can reuse it automatically instead of
// showing the device picker. Leave as null until the scale has been paired
// once — after clicking "Connect to Scale" the vendor/product IDs are shown
// under "Port —" in the Connection card; copy them in here.
export const KNOWN_SCALE_DEVICE: KnownScaleDevice | null = null;
