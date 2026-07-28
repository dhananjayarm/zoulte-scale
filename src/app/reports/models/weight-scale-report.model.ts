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
