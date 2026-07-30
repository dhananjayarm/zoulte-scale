import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { HttpGetService } from '../../services/http-get.service';
import { MaterialApiService, ProductRow } from '../../services/masters/material-api.service';
import {
  REPORT_COLUMNS,
  REPORT_DESCENDING_FIRST,
  REPORT_STATUS_OPTIONS,
  WeightScaleReportItem,
  compareReportRows,
  downloadBlob,
  todayIso,
  type ReportSortKey,
} from '../models/weight-scale-report.model';
import { toUnitSymbol } from '../../services/data/units';

@Component({
  selector: 'app-product-report',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './product-report.component.html',
  styleUrl: './product-report.component.css',
})
export class ProductReportComponent {
  readonly filterForm = this.fb.group({
    fromDt: [todayIso(), Validators.required],
    toDt: [todayIso(), Validators.required],
    productCode: [''],
    // Reports default to signed-off records for today; widen either as needed.
    status: ['APPROVED'],
  });

  readonly rows = signal<WeightScaleReportItem[]>([]);
  readonly products = signal<ProductRow[]>([]);
  readonly isLoading = signal(false);
  readonly isExporting = signal(false);
  readonly isExportingPdf = signal(false);
  readonly loadError = signal<string | null>(null);
  private readonly datePipe = new DatePipe('en-US');
  readonly hasSearched = signal(false);

  // Local search + pagination, layered on top of the fetched rows.
  readonly searchTerm = signal('');
  readonly filteredRows = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return this.rows();
    }
    return this.rows().filter(
      (row) =>
        (row.productName ?? '').toLowerCase().includes(term) ||
        (row.manufacturerName ?? '').toLowerCase().includes(term),
    );
  });

  readonly columns = REPORT_COLUMNS;
  // Null until the reader picks a column, so the report first appears in server order.
  readonly sortKey = signal<ReportSortKey | null>(null);
  readonly sortDir = signal<'asc' | 'desc'>('asc');

  /** Sorted before paging, so the order runs across the whole report, not one page of it. */
  readonly sortedRows = computed(() => {
    const key = this.sortKey();
    if (!key) {
      return this.filteredRows();
    }
    const direction = this.sortDir() === 'asc' ? 1 : -1;
    return [...this.filteredRows()].sort((a, b) => direction * compareReportRows(a, b, key));
  });

  readonly pageSize = signal(10);
  readonly currentPage = signal(1);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize())));
  readonly pagedRows = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const size = this.pageSize();
    const start = (page - 1) * size;
    return this.sortedRows().slice(start, start + size);
  });

  /** Clicking the active column flips direction; a new column opens on its most useful end. */
  sortBy(key: ReportSortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortKey.set(key);
      this.sortDir.set(REPORT_DESCENDING_FIRST.has(key) ? 'desc' : 'asc');
    }
    this.currentPage.set(1);
  }

  sortArrow(key: ReportSortKey): string {
    return this.sortKey() === key && this.sortDir() === 'asc' ? '▲' : '▼';
  }

  ariaSort(key: ReportSortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) {
      return 'none';
    }
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  unitSymbol(unitWeight: string): string {
    return toUnitSymbol(unitWeight);
  }

  /** Page numbers to render, with `null` standing in for a "…" gap. Always shows first/last and a window around the current page. */
  readonly pageNumbers = computed<(number | null)[]>(() => {
    const total = this.totalPages();
    const current = Math.min(this.currentPage(), total);
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | null)[] = [1];
    if (current > 3) {
      pages.push(null);
    }
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    if (current < total - 2) {
      pages.push(null);
    }
    pages.push(total);
    return pages;
  });

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
    this.currentPage.set(1);
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    this.currentPage.set(Math.min(Math.max(1, page), this.totalPages()));
  }

  constructor(
    private readonly fb: FormBuilder,
    private readonly httpGet: HttpGetService,
    private readonly materialApi: MaterialApiService
  ) {
    this.materialApi.listProducts().subscribe((rows) => this.products.set(rows));
  }

  readonly statusOptions = REPORT_STATUS_OPTIONS;

  private buildQuery(fromDt: string, toDt: string, productCode: string, status: string): string {
    const params = new URLSearchParams({ fromDt, toDt });
    if (productCode) {
      params.set('productCode', productCode);
    }
    if (status) {
      params.set('status', status);
    }
    return params.toString();
  }

  search(): void {
    if (this.filterForm.invalid) {
      this.filterForm.markAllAsTouched();
      return;
    }

    const { fromDt, toDt, productCode, status } = this.filterForm.getRawValue();
    this.isLoading.set(true);
    this.loadError.set(null);
    this.hasSearched.set(true);
    this.searchTerm.set('');
    this.currentPage.set(1);

    this.httpGet
      .getSfa<{ response?: WeightScaleReportItem[] } | WeightScaleReportItem[]>(
        `api/weightscaleproduct/reports?${this.buildQuery(fromDt!, toDt!, productCode ?? '', status ?? '')}`
      )
      .subscribe({
        next: (res) => {
          this.rows.set(Array.isArray(res) ? res : res?.response ?? []);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Product report load failed', err);
          this.loadError.set(`Unable to load the product report. (${err?.status ?? 'network error'})`);
          this.isLoading.set(false);
        },
      });
  }

  exportToExcel(): void {
    if (this.filterForm.invalid) {
      this.filterForm.markAllAsTouched();
      return;
    }

    const { fromDt, toDt, productCode, status } = this.filterForm.getRawValue();
    this.isExporting.set(true);
    this.loadError.set(null);

    this.httpGet
      .getSfaBlob(`api/weightscaleproduct/reports/xls?${this.buildQuery(fromDt!, toDt!, productCode ?? '', status ?? '')}`)
      .subscribe({
        next: (blob) => {
          downloadBlob(blob, `product-report-${fromDt}-to-${toDt}.xlsx`);
          this.isExporting.set(false);
        },
        error: (err) => {
          console.error('Product report export failed', err);
          this.loadError.set(`Unable to export the report. (${err?.status ?? 'network error'})`);
          this.isExporting.set(false);
        },
      });
  }

  /** PDF export — fetches fresh data from the same list API `search()` uses, then builds the PDF client-side. */
  exportToPdf(): void {
    if (this.filterForm.invalid) {
      this.filterForm.markAllAsTouched();
      return;
    }
    if (this.isExportingPdf()) {
      return;
    }

    const { fromDt, toDt, productCode, status } = this.filterForm.getRawValue();
    this.isExportingPdf.set(true);
    this.loadError.set(null);

    this.httpGet
      .getSfa<{ response?: WeightScaleReportItem[] } | WeightScaleReportItem[]>(
        `api/weightscaleproduct/reports?${this.buildQuery(fromDt!, toDt!, productCode ?? '', status ?? '')}`
      )
      .subscribe({
        next: (res) => {
          const rows = Array.isArray(res) ? res : res?.response ?? [];
          this.buildPdf(rows, fromDt!, toDt!);
          this.isExportingPdf.set(false);
        },
        error: (err) => {
          console.error('Product report PDF export failed', err);
          this.loadError.set(`Unable to export the report. (${err?.status ?? 'network error'})`);
          this.isExportingPdf.set(false);
        },
      });
  }

  private buildPdf(rows: WeightScaleReportItem[], fromDt: string, toDt: string): void {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Title block: what the report is, what it covers, and when it was taken — a
    // printed report gets separated from its screen, so it has to say so itself.
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Product Report', 14, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Zoulte Scale', pageWidth - 14, 13, { align: 'right' });

    doc.setTextColor(70, 70, 70);
    doc.setFontSize(9);
    doc.text(`Period  ${fromDt}  to  ${toDt}`, 14, 27);
    doc.text(`Records  ${rows.length}`, 100, 27);
    doc.text(`Generated  ${this.datePipe.transform(new Date(), 'yyyy-MM-dd HH:mm') ?? ''}`, pageWidth - 14, 27, {
      align: 'right',
    });
    doc.setDrawColor(220, 220, 220);
    doc.line(14, 31, pageWidth - 14, 31);

    if (rows.length) {
      // Same columns, same order, same unit symbol as the table on screen — an export
      // that doesn't match what was just read is a support call waiting to happen.
      autoTable(doc, {
        startY: 36,
        head: [['Date', 'Time', 'Product', 'Weight', 'Batch', 'Mfd Date', 'Expiry Date', 'Manufacturer', 'Status']],
        body: rows.map((row) => [
          this.datePipe.transform(row.createddate, 'yyyy-MM-dd') ?? '',
          this.datePipe.transform(row.createddate, 'HH:mm:ss') ?? '',
          row.productName ?? '',
          `${row.netWeight ?? ''} ${toUnitSymbol(row.unitWeight ?? '')}`.trim(),
          row.batchNo ?? '',
          this.datePipe.transform(row.manufacturingDate, 'yyyy-MM-dd') ?? '',
          this.datePipe.transform(row.expiryDate, 'yyyy-MM-dd') ?? '',
          row.manufacturerName ?? '',
          row.status ?? '',
        ]),
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [225, 225, 225], textColor: [40, 40, 40] },
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'left',
        },
        alternateRowStyles: { fillColor: [247, 249, 252] },
        // Figures in courier so dates and weights line up column-wise, as on screen.
        columnStyles: {
          0: { font: 'courier', cellWidth: 24 },
          1: { font: 'courier', cellWidth: 20 },
          3: { font: 'courier', halign: 'right', cellWidth: 24 },
          5: { font: 'courier', cellWidth: 24 },
          6: { font: 'courier', cellWidth: 24 },
        },
        margin: { left: 14, right: 14, bottom: 18 },
        didDrawPage: () => this.stampFooter(doc, pageWidth, pageHeight),
      });
    } else {
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(10);
      doc.text('No records matched this report.', 14, 42);
      this.stampFooter(doc, pageWidth, pageHeight);
    }

    doc.save(`product-report-${fromDt}-to-${toDt}.pdf`);
  }

  /** Page number and provenance on every page — printed sheets get separated. */
  private stampFooter(doc: jsPDF, pageWidth: number, pageHeight: number): void {
    const page = doc.getNumberOfPages();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text('Zoulte Scale — Product Report', 14, pageHeight - 8);
    doc.text(`Page ${page}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }
}
