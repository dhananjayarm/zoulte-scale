import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpGetService } from '../../services/http-get.service';
import { MaterialApiService, ProductRow } from '../../services/masters/material-api.service';
import { WeightScaleReportItem, downloadBlob, todayIso } from '../models/weight-scale-report.model';

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
  });

  readonly rows = signal<WeightScaleReportItem[]>([]);
  readonly products = signal<ProductRow[]>([]);
  readonly isLoading = signal(false);
  readonly isExporting = signal(false);
  readonly loadError = signal<string | null>(null);
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
        `api/weightscaleproduct/reports?${this.buildQuery(fromDt!, toDt!, productCode ?? '')}`
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

    const { fromDt, toDt, productCode } = this.filterForm.getRawValue();
    this.isExporting.set(true);
    this.loadError.set(null);

    this.httpGet
      .getSfaBlob(`api/weightscaleproduct/reports/xls?${this.buildQuery(fromDt!, toDt!, productCode ?? '')}`)
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
}
