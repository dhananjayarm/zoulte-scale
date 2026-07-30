export interface WeightScaleReportItem {
  id: number;
  productCode: string;
  productName: string;
  batchNo: string;
  dateCode: string;
  manufacturerName: string;
  manufacturingDate: string;
  expiryDate: string;
  netWeight: number;
  unitWeight: string;
  isActive: boolean;
  /** Verification lifecycle: NEW / APPROVED / REJECTED. */
  status: string;
  companyCode: string;
  branchCode: string;
  createdby: string;
  createddate: string;
  lastmodifiedby: string | null;
  lastmodifieddate: string;
}

export interface WeightScaleReportResponse {
  status: { code: number; message: string };
  response: WeightScaleReportItem[];
}

/** Columns both reports can sort by, in the order the verification screen uses. */
export type ReportSortKey =
  | 'date'
  | 'time'
  | 'product'
  | 'weight'
  | 'batch'
  | 'mfgDate'
  | 'expiryDate'
  | 'manufacturer'
  | 'status';

export const REPORT_COLUMNS: ReadonlyArray<{ key: ReportSortKey; label: string }> = [
  { key: 'date', label: 'Date' },
  { key: 'time', label: 'Time' },
  { key: 'product', label: 'Product' },
  { key: 'weight', label: 'Weight' },
  { key: 'batch', label: 'Batch' },
  { key: 'mfgDate', label: 'Mfd Date' },
  { key: 'expiryDate', label: 'Expiry Date' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'status', label: 'Status' },
];

/** The report filter's status choices — reports default to signed-off records. */
export const REPORT_STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'APPROVED', label: 'Approved' },
  { value: 'ALL', label: 'All statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'REJECTED', label: 'Rejected' },
];

/** Columns whose useful end is the high one — newest capture, heaviest weight, latest date. */
export const REPORT_DESCENDING_FIRST = new Set<ReportSortKey>([
  'date',
  'time',
  'weight',
  'mfgDate',
  'expiryDate',
]);

export function compareReportRows(a: WeightScaleReportItem, b: WeightScaleReportItem, key: ReportSortKey): number {
  switch (key) {
    // Date and Time render the same instant, so each sorts by what it shows: Date by
    // the full timestamp, Time by clock time — which groups an early shift across days.
    case 'date':
      return toTimestamp(a.createddate) - toTimestamp(b.createddate);
    case 'time':
      return toSecondsOfDay(a.createddate) - toSecondsOfDay(b.createddate);
    case 'product':
      return (a.productName ?? '').localeCompare(b.productName ?? '');
    case 'weight':
      return (a.netWeight ?? 0) - (b.netWeight ?? 0);
    case 'batch':
      return (a.batchNo ?? '').localeCompare(b.batchNo ?? '');
    case 'mfgDate':
      return toTimestamp(a.manufacturingDate) - toTimestamp(b.manufacturingDate);
    case 'expiryDate':
      return toTimestamp(a.expiryDate) - toTimestamp(b.expiryDate);
    case 'manufacturer':
      return (a.manufacturerName ?? '').localeCompare(b.manufacturerName ?? '');
    case 'status':
      return (a.status ?? '').localeCompare(b.status ?? '');
  }
}

/**
 * Unparseable dates sort oldest, so a bad row never leads the list. Accepts a number
 * because Jackson may serialise the DTO's java.util.Date fields as epoch millis.
 */
export function toTimestamp(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Seconds since local midnight — the Time column's sort key. */
export function toSecondsOfDay(value: string | number | null | undefined): number {
  const ms = toTimestamp(value);
  if (!ms) {
    return 0;
  }
  const at = new Date(ms);
  return at.getHours() * 3600 + at.getMinutes() * 60 + at.getSeconds();
}

export function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
