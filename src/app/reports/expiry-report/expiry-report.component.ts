import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { HttpGetService } from '../../services/http-get.service';
import { MaterialApiService, ProductRow } from '../../services/masters/material-api.service';
import { WeightScaleReportItem, downloadBlob, todayIso } from '../models/weight-scale-report.model';

@Component({
  selector: 'app-expiry-report',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './expiry-report.component.html',
  styleUrl: './expiry-report.component.css',
})
export class ExpiryReportComponent {
  readonly filterForm = this.fb.group({
    fromDt: [todayIso(), Validators.required],
    toDt: [todayIso(), Validators.required],
    productCode: [''],
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

  readonly pageSize = signal(10);
  readonly currentPage = signal(1);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize())));
  readonly pagedRows = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const size = this.pageSize();
    const start = (page - 1) * size;
    return this.filteredRows().slice(start, start + size);
  });

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

  private buildQuery(fromDt: string, toDt: string, productCode: string): string {
    const params = new URLSearchParams({ fromDt, toDt });
    if (productCode) {
      params.set('productCode', productCode);
    }
    return params.toString();
  }

  search(): void {
    if (this.filterForm.invalid) {
      this.filterForm.markAllAsTouched();
      return;
    }

    const { fromDt, toDt, productCode } = this.filterForm.getRawValue();
    this.isLoading.set(true);
    this.loadError.set(null);
    this.hasSearched.set(true);
    this.searchTerm.set('');
    this.currentPage.set(1);

    this.httpGet
      .getSfa<{ response?: WeightScaleReportItem[] } | WeightScaleReportItem[]>(
        `api/weightscaleproduct/reports/expiry?${this.buildQuery(fromDt!, toDt!, productCode ?? '')}`
      )
      .subscribe({
        next: (res) => {
          this.rows.set(Array.isArray(res) ? res : res?.response ?? []);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Expiry report load failed', err);
          this.loadError.set(`Unable to load the expiry report. (${err?.status ?? 'network error'})`);
          this.isLoading.set(false);
        },
      });
  }

  expiryStatus(expiryDate: string | null | undefined): { label: string; className: string } {
    if (!expiryDate) {
      return { label: '—', className: '' };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const diffDays = Math.round((expiry.getTime() - today.getTime()) / 86400000);

    if (diffDays < 0) {
      return { label: 'Expired', className: 'status-expired' };
    }
    if (diffDays <= 30) {
      return { label: `${diffDays}d left`, className: 'status-soon' };
    }
    return { label: 'OK', className: 'status-ok' };
  }

  exportToExcel(): void {
    if (this.filterForm.invalid) {
      this.filterForm.markAllAsTouched();
      return;
    }

    const { fromDt, toDt, productCode } = this.filterForm.getRawValue();
    this.isExporting.set(true);
    this.loadError.set(null);

    this.httpGet
      .getSfaBlob(`api/weightscaleproduct/reports/expiry/xls?${this.buildQuery(fromDt!, toDt!, productCode ?? '')}`)
      .subscribe({
        next: (blob) => {
          downloadBlob(blob, `expiry-report-${fromDt}-to-${toDt}.xlsx`);
          this.isExporting.set(false);
        },
        error: (err) => {
          console.error('Expiry report export failed', err);
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

    const { fromDt, toDt, productCode } = this.filterForm.getRawValue();
    this.isExportingPdf.set(true);
    this.loadError.set(null);

    this.httpGet
      .getSfa<{ response?: WeightScaleReportItem[] } | WeightScaleReportItem[]>(
        `api/weightscaleproduct/reports/expiry?${this.buildQuery(fromDt!, toDt!, productCode ?? '')}`
      )
      .subscribe({
        next: (res) => {
          const rows = Array.isArray(res) ? res : res?.response ?? [];
          this.buildPdf(rows, fromDt!, toDt!);
          this.isExportingPdf.set(false);
        },
        error: (err) => {
          console.error('Expiry report PDF export failed', err);
          this.loadError.set(`Unable to export the report. (${err?.status ?? 'network error'})`);
          this.isExportingPdf.set(false);
        },
      });
  }

  private buildPdf(rows: WeightScaleReportItem[], fromDt: string, toDt: string): void {
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(14);
    doc.text('Expiry Report', 14, 16);
    doc.setFontSize(12);
    doc.text(`${fromDt} to ${toDt}`, 14, 22);

    if (rows.length) {
      autoTable(doc, {
        startY: 28,
        head: [['Product', 'Batch', 'Manufacturer', 'Mfg Date', 'Expiry Date', 'Weight', 'Status']],
        body: rows.map((row) => [
          row.productName ?? '',
          row.batchNo ?? '',
          row.manufacturerName ?? '',
          this.datePipe.transform(row.manufacturingDate, 'yyyy-MM-dd') ?? '',
          this.datePipe.transform(row.expiryDate, 'yyyy-MM-dd') ?? '',
          `${row.netWeight ?? ''} ${row.unitWeight ?? ''}`.trim(),
          this.expiryStatus(row.expiryDate).label,
        ]),
        styles: { fontSize: 11 },
        headStyles: { fillColor: [37, 99, 235] },
      });
    } else {
      doc.setFontSize(11);
      doc.text('No data found.', 14, 34);
    }

    doc.save(`expiry-report-${fromDt}-to-${toDt}.pdf`);
  }
}
