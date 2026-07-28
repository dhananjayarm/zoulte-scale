import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpGetService } from '../../services/http-get.service';
import { WeightScaleReportItem, downloadBlob, todayIso } from '../models/weight-scale-report.model';

@Component({
  selector: 'app-expiry-report',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './expiry-report.component.html',
  styleUrl: './expiry-report.component.css',
})
export class ExpiryReportComponent {
  readonly filterForm = this.fb.group({
    fromDt: [todayIso(), Validators.required],
    toDt: [todayIso(), Validators.required],
  });

  readonly rows = signal<WeightScaleReportItem[]>([]);
  readonly isLoading = signal(false);
  readonly isExporting = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly hasSearched = signal(false);

  constructor(
    private readonly fb: FormBuilder,
    private readonly httpGet: HttpGetService
  ) {}

  search(): void {
    if (this.filterForm.invalid) {
      this.filterForm.markAllAsTouched();
      return;
    }

    const { fromDt, toDt } = this.filterForm.getRawValue();
    this.isLoading.set(true);
    this.loadError.set(null);
    this.hasSearched.set(true);

    this.httpGet
      .getSfa<{ response?: WeightScaleReportItem[] } | WeightScaleReportItem[]>(
        `api/weightscaleproduct/reports/expiry?fromDt=${fromDt}&toDt=${toDt}`
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

  exportToExcel(): void {
    if (this.filterForm.invalid) {
      this.filterForm.markAllAsTouched();
      return;
    }

    const { fromDt, toDt } = this.filterForm.getRawValue();
    this.isExporting.set(true);
    this.loadError.set(null);

    this.httpGet
      .getSfaBlob(`api/weightscaleproduct/reports/expiry/xls?fromDt=${fromDt}&toDt=${toDt}`)
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
}
